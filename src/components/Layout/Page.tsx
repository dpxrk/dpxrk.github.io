import {NextPage} from 'next';
import Head from 'next/head';
// import {useRouter} from 'next/router';
import {memo, PropsWithChildren} from 'react';

import {HomepageMeta} from '../../data/dataDef';

const Page: NextPage<PropsWithChildren<HomepageMeta>> = memo(({children, title, description}) => {
  return (
    <>
      <Head>
        <title>{title}</title>
        <meta content={description} name="description" />
      </Head>
      {children}
    </>
  );
});

Page.displayName = 'Page';
export default Page;
